import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, Mail, ChevronLeft, ArrowRight, CheckCircle } from 'lucide-react';
import api from '../../services/api';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email'); // 'email' | 'code' | 'sent'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  const handleSendReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.post('/auth/forgot-password', { email });
      setStep('sent');
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשליחת המייל');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.post('/auth/verify-reset-token', { code, email });
      // Code is valid, navigate to reset page with code and email
      navigate('/reset-password', { state: { code, email } });
    } catch (err) {
      setError(err.response?.data?.error || 'הקוד אינו תקין או שפג תוקפו');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <Link to="/" className="inline-flex items-center gap-2 mb-8 group">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">Botomat</span>
          </Link>

          {step === 'email' && (
            <>
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  שכחת סיסמה? 🔑
                </h1>
                <p className="text-gray-500">
                  הזן את כתובת האימייל שלך ונשלח לך קישור לאיפוס הסיסמה
                </p>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSendReset} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    כתובת אימייל
                  </label>
                  <div className={`relative rounded-xl transition-all ${
                    focusedField === 'email' ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                  }`}>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <Mail className={`w-5 h-5 transition-colors ${
                        focusedField === 'email' ? 'text-blue-500' : 'text-gray-400'
                      }`} />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="email@example.com"
                      required
                      className="w-full pr-12 pl-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:bg-white transition-all text-gray-900 placeholder:text-gray-400"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/25 hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      שלח קישור לאיפוס
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {step === 'sent' && (
            <>
              {/* Success State */}
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">המייל נשלח! 📧</h2>
                <p className="text-gray-500 mb-6">
                  אם האימייל {email} קיים במערכת, נשלח אליו קישור לאיפוס סיסמה.
                  <br />
                  <span className="text-sm">הקוד תקף ל-5 דקות בלבד.</span>
                </p>

                {/* Error Alert */}
                {error && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-xl">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}

                {/* Code Input */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    או הזן את הקוד שקיבלת במייל:
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full py-4 px-4 bg-gray-50 border border-gray-200 rounded-xl text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    maxLength={6}
                  />
                </div>

                <button
                  onClick={handleVerifyCode}
                  disabled={loading || code.length !== 6}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                  ) : (
                    'אמת קוד'
                  )}
                </button>

                <button
                  onClick={() => setStep('email')}
                  className="w-full mt-3 py-3 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                >
                  לא קיבלת? שלח שוב
                </button>
              </div>
            </>
          )}

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
