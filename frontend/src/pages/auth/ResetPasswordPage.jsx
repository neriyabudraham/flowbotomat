import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Bot, Lock, Eye, EyeOff, ChevronLeft, ArrowRight, CheckCircle, XCircle } from 'lucide-react';
import api from '../../services/api';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // Get token from URL or code/email from state (if user entered code manually)
  const tokenFromUrl = searchParams.get('token');
  const codeFromState = location.state?.code;
  const emailFromState = location.state?.email;
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!tokenFromUrl && !codeFromState) {
        setError('קישור לא תקין. אנא בקש קישור חדש לאיפוס סיסמה.');
        setVerifying(false);
        return;
      }

      try {
        const payload = tokenFromUrl 
          ? { token: tokenFromUrl }
          : { code: codeFromState, email: emailFromState };
          
        const { data } = await api.post('/auth/verify-reset-token', payload);
        
        if (data.valid) {
          setTokenValid(true);
          setUserEmail(data.email);
        }
      } catch (err) {
        setError(err.response?.data?.error || 'הקישור אינו תקין או שפג תוקפו');
      } finally {
        setVerifying(false);
      }
    };

    verifyToken();
  }, [tokenFromUrl, codeFromState, emailFromState]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    if (password !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }

    setLoading(true);

    try {
      const payload = tokenFromUrl 
        ? { token: tokenFromUrl, newPassword: password }
        : { code: codeFromState, email: emailFromState, newPassword: password };
        
      await api.post('/auth/reset-password', payload);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה באיפוס הסיסמה');
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">מאמת את הקישור...</p>
        </div>
      </div>
    );
  }

  // Invalid token state
  if (!tokenValid && !success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4" dir="rtl">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">קישור לא תקין</h2>
            <p className="text-gray-500 mb-6">{error || 'הקישור לאיפוס הסיסמה אינו תקין או שפג תוקפו.'}</p>
            
            <Link
              to="/forgot-password"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl transition-all"
            >
              בקש קישור חדש
              <ArrowRight className="w-5 h-5" />
            </Link>
            
            <div className="mt-6">
              <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700">
                חזרה להתחברות
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4" dir="rtl">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">הסיסמה שונתה בהצלחה! 🎉</h2>
            <p className="text-gray-500 mb-6">
              כעת תוכל להתחבר עם הסיסמה החדשה שלך.
            </p>
            
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl transition-all"
            >
              להתחברות
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Reset password form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <Link to="/" className="inline-flex items-center gap-2 mb-8 group">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">FlowBotomat</span>
          </Link>

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              בחר סיסמה חדשה 🔐
            </h1>
            <p className="text-gray-500">
              מאפס סיסמה עבור: <span className="font-medium text-gray-700">{userEmail}</span>
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                סיסמה חדשה
              </label>
              <div className={`relative rounded-xl transition-all ${
                focusedField === 'password' ? 'ring-2 ring-blue-500 ring-offset-2' : ''
              }`}>
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Lock className={`w-5 h-5 transition-colors ${
                    focusedField === 'password' ? 'text-blue-500' : 'text-gray-400'
                  }`} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="לפחות 6 תווים"
                  required
                  minLength={6}
                  className="w-full pr-12 pl-12 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:bg-white transition-all text-gray-900 placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                אימות סיסמה
              </label>
              <div className={`relative rounded-xl transition-all ${
                focusedField === 'confirm' ? 'ring-2 ring-blue-500 ring-offset-2' : ''
              }`}>
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Lock className={`w-5 h-5 transition-colors ${
                    focusedField === 'confirm' ? 'text-blue-500' : 'text-gray-400'
                  }`} />
                </div>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onFocus={() => setFocusedField('confirm')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="הזן שוב את הסיסמה"
                  required
                  className="w-full pr-12 pl-12 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:bg-white transition-all text-gray-900 placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-red-500 text-sm mt-1">הסיסמאות אינן תואמות</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || password.length < 6 || password !== confirmPassword}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/25 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  שנה סיסמה
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Back to Login */}
          <div className="mt-6 text-center">
            <Link 
              to="/login" 
              className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
              חזרה להתחברות
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
