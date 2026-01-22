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
  });
  const [loading, setLoading] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const [error, setError] = useState('');

  // Load Sumit SDK on component mount
  useEffect(() => {
    loadSumitSDK();
  }, []);

  /**
   * Load the Sumit tokenization SDK
   */
  const loadSumitSDK = useCallback(() => {
    // Check if already loaded
    if (typeof window.SumitTokenize !== 'undefined') {
      console.log('[Sumit] SDK already loaded');
      setSdkLoaded(true);
      return;
    }

    // Check if script is already in DOM
    const existingScript = document.querySelector(`script[src="${SUMIT_SDK_URL}"]`);
    if (existingScript) {
      // Wait for it to load
      existingScript.onload = () => {
        console.log('[Sumit] SDK loaded (existing script)');
        setSdkLoaded(true);
      };
      existingScript.onerror = () => {
        console.error('[Sumit] SDK failed to load (existing script)');
        setSdkError(true);
      };
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
      console.error('[Sumit] Failed to load SDK');
      setSdkError(true);
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
   * Get SingleUseToken from Sumit SDK
   * This token is only valid for a few minutes!
   */
  const getSumitToken = async (cardData) => {
    return new Promise((resolve, reject) => {
      if (typeof window.SumitTokenize === 'undefined') {
        reject(new Error('Sumit SDK not loaded'));
        return;
      }

      if (!SUMIT_PUBLIC_KEY) {
        reject(new Error('Sumit public key not configured'));
        return;
      }

      console.log('[Sumit] Requesting tokenization...');

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
            // Parse error message
            let errorMsg = response.UserErrorMessage || 'שגיאה באימות הכרטיס';
            
            // Common error translations
            if (errorMsg.includes('declined')) {
              errorMsg = 'הכרטיס נדחה. אנא בדוק את הפרטים.';
            } else if (errorMsg.includes('invalid')) {
              errorMsg = 'פרטי כרטיס לא תקינים.';
            } else if (errorMsg.includes('expired')) {
              errorMsg = 'פג תוקף הכרטיס.';
            }
            
            reject(new Error(errorMsg));
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

    // Check SDK is loaded
    if (!sdkLoaded) {
      if (sdkError) {
        setError('שגיאה בטעינת מערכת התשלומים. אנא רענן את הדף.');
      } else {
        setError('מערכת התשלומים נטענת. אנא המתן מספר שניות ונסה שנית.');
      }
      return;
    }
    
    setLoading(true);
    
    try {
      // Step 1: Get short-term token from Sumit SDK
      console.log('[Payment] Step 1: Getting Sumit token...');
      
      let tokenData;
      try {
        tokenData = await getSumitToken({
          cardNumber: cardNum,
          expiryMonth: parseInt(form.expiryMonth),
          expiryYear: parseInt(form.expiryYear),
          cvv: form.cvv,
          citizenId: form.citizenId,
        });
      } catch (tokenError) {
        console.error('[Payment] Tokenization failed:', tokenError.message);
        setError(tokenError.message || 'שגיאה באימות הכרטיס. אנא בדוק את הפרטים.');
        setLoading(false);
        return;
      }

      if (!tokenData?.token) {
        setError('לא התקבל טוקן אשראי. אנא נסה שנית.');
        setLoading(false);
        return;
      }

      console.log('[Payment] Step 2: Sending token to backend...');
      
      // Step 2: Send token IMMEDIATELY to backend (token expires quickly!)
      const requestData = {
        singleUseToken: tokenData.token,
        cardHolderName: form.cardHolderName.trim(),
        citizenId: form.citizenId || null,
        companyNumber: form.companyNumber || null,
        lastDigits: tokenData.last4 || cardNum.slice(-4),
        expiryMonth: parseInt(form.expiryMonth),
        expiryYear: parseInt(form.expiryYear),
      };
      
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
      
      // Handle specific error codes
      if (err.response?.data?.code === 'MISSING_TOKEN') {
        errorMsg = 'נדרש לרענן את הדף ולנסות שנית.';
      } else if (err.response?.data?.code === 'SUMIT_ERROR') {
        // Already translated by backend
      }
      
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

      {/* SDK Loading Warning */}
      {!sdkLoaded && !sdkError && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          <p className="text-sm text-blue-700">טוען מערכת תשלומים מאובטחת...</p>
        </div>
      )}

      {/* SDK Error Warning */}
      {sdkError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <p className="text-sm text-amber-800 font-medium">שגיאה בטעינת מערכת התשלומים</p>
            <p className="text-xs text-amber-600 mt-1">אנא רענן את הדף ונסה שנית.</p>
          </div>
        </div>
      )}

      {/* Card Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          מספר כרטיס
        </label>
        <div className="relative">
          <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
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
            תעודת זהות
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

      {/* Company Number (optional) */}
      {showCompanyNumber && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ח.פ. / עוסק מורשה <span className="text-gray-400 font-normal">(אופציונלי)</span>
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
          disabled={loading || !sdkLoaded || sdkError} 
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

      {/* Trust badges */}
      <div className="flex items-center justify-center gap-4 pt-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Lock className="w-3.5 h-3.5" />
          <span>הצפנת SSL</span>
        </div>
        <div className="w-px h-3 bg-gray-200" />
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Shield className="w-3.5 h-3.5" />
          <span>PCI DSS</span>
        </div>
      </div>
    </form>
  );
}
