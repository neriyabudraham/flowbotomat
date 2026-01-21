import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Bot, Sparkles, Shield, Zap, ChevronLeft, Mail, Lock, Eye, EyeOff, User,
  MessageCircle, Users, TrendingUp, ArrowRight, CheckCircle, Check, Gift, Clock
} from 'lucide-react';
import useAuthStore from '../../store/authStore';

export default function SignupPage() {
  const navigate = useNavigate();
  const { signup, isLoading, error, clearError } = useAuthStore();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [privacyError, setPrivacyError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    setPrivacyError(false);
    
    if (!acceptPrivacy) {
      setPrivacyError(true);
      return;
    }
    
    try {
      await signup(form.email, form.password, form.name);
      navigate('/verify', { state: { email: form.email } });
    } catch {}
  };

  const benefits = [
    { icon: Sparkles, text: '14 ימי ניסיון חינם', highlight: true },
    { icon: MessageCircle, text: 'בוטים ללא הגבלה' },
    { icon: Users, text: 'ניהול לקוחות מתקדם' },
    { icon: Shield, text: 'אבטחה ברמה הגבוהה' },
    { icon: Zap, text: 'עורך ויזואלי אינטואיטיבי' },
    { icon: TrendingUp, text: 'סטטיסטיקות מפורטות' },
  ];

  const stats = [
    { value: '5 דק׳', label: 'ליצירת בוט' },
    { value: '14', label: 'ימי ניסיון' },
    { value: '0', label: 'קוד נדרש' },
  ];

  // Password strength indicator
  const getPasswordStrength = () => {
    const password = form.password;
    if (!password) return { strength: 0, label: '', color: '' };
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    if (strength <= 1) return { strength: 1, label: 'חלשה', color: 'bg-red-500' };
    if (strength === 2) return { strength: 2, label: 'בינונית', color: 'bg-yellow-500' };
    if (strength === 3) return { strength: 3, label: 'טובה', color: 'bg-blue-500' };
    return { strength: 4, label: 'חזקה', color: 'bg-green-500' };
  };

  const passwordStrength = getPasswordStrength();

  return (
    <div className="min-h-screen flex" dir="rtl">
      {/* Left Side - Form */}
      <div className="flex-1 flex flex-col justify-center px-6 lg:px-16 xl:px-24 bg-white relative">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-[0.02]">
          <div className="absolute inset-0" style={{ 
            backgroundImage: 'radial-gradient(circle at 2px 2px, #10b981 1px, transparent 0)', 
            backgroundSize: '32px 32px' 
          }} />
        </div>

        <div className="relative z-10 max-w-md mx-auto w-full py-8">
          {/* Logo */}
          <Link to="/" className="inline-flex items-center gap-2 mb-8 group">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/25 group-hover:scale-105 transition-transform">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">FlowBotomat</span>
          </Link>

          {/* Header */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full mb-4">
              <Gift className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">14 ימי ניסיון חינם</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              צור חשבון חדש 🚀
            </h1>
            <p className="text-gray-500">
              הצטרף לאלפי עסקים שכבר משתמשים ב-FlowBotomat
            </p>
          </div>

          {/* Error Alerts */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl">
              <p className="text-red-700 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">!</span>
                {error}
              </p>
            </div>
          )}
          {privacyError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl">
              <p className="text-red-700 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">!</span>
                יש לאשר את מדיניות הפרטיות
              </p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                שם מלא
              </label>
              <div className={`relative rounded-xl transition-all ${
                focusedField === 'name' 
                  ? 'ring-2 ring-emerald-500 ring-offset-2' 
                  : ''
              }`}>
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <User className={`w-5 h-5 transition-colors ${
                    focusedField === 'name' ? 'text-emerald-500' : 'text-gray-400'
                  }`} />
                </div>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="השם שלך"
                  className="w-full pr-12 pl-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:bg-white transition-all text-gray-900 placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                כתובת אימייל
              </label>
              <div className={`relative rounded-xl transition-all ${
                focusedField === 'email' 
                  ? 'ring-2 ring-emerald-500 ring-offset-2' 
                  : ''
              }`}>
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Mail className={`w-5 h-5 transition-colors ${
                    focusedField === 'email' ? 'text-emerald-500' : 'text-gray-400'
                  }`} />
                </div>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="email@example.com"
                  required
                  className="w-full pr-12 pl-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:bg-white transition-all text-gray-900 placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                סיסמה
              </label>
              <div className={`relative rounded-xl transition-all ${
                focusedField === 'password' 
                  ? 'ring-2 ring-emerald-500 ring-offset-2' 
                  : ''
              }`}>
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Lock className={`w-5 h-5 transition-colors ${
                    focusedField === 'password' ? 'text-emerald-500' : 'text-gray-400'
                  }`} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="לפחות 8 תווים"
                  required
                  minLength={8}
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
              
              {/* Password Strength Indicator */}
              {form.password && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500">חוזק הסיסמה</span>
                    <span className={`text-xs font-medium ${
                      passwordStrength.strength <= 1 ? 'text-red-600' :
                      passwordStrength.strength === 2 ? 'text-yellow-600' :
                      passwordStrength.strength === 3 ? 'text-blue-600' : 'text-green-600'
                    }`}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div 
                        key={level} 
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          level <= passwordStrength.strength ? passwordStrength.color : 'bg-gray-200'
                        }`} 
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Privacy Policy Checkbox */}
            <label className={`flex items-start gap-3 cursor-pointer p-4 rounded-xl border-2 transition-all ${
              privacyError 
                ? 'border-red-300 bg-red-50' 
                : acceptPrivacy 
                  ? 'border-emerald-300 bg-emerald-50' 
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}>
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all mt-0.5 ${
                acceptPrivacy ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'
              }`}>
                {acceptPrivacy && <Check className="w-4 h-4 text-white" />}
              </div>
              <input
                type="checkbox"
                checked={acceptPrivacy}
                onChange={(e) => {
                  setAcceptPrivacy(e.target.checked);
                  if (e.target.checked) setPrivacyError(false);
                }}
                className="hidden"
              />
              <span className="text-sm text-gray-600 leading-relaxed">
                קראתי ואני מסכים/ה ל
                <Link 
                  to="/privacy" 
                  target="_blank"
                  className="text-emerald-600 hover:underline mx-1 font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  מדיניות הפרטיות
                </Link>
                ולתנאי השימוש
              </span>
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !acceptPrivacy}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  צור חשבון
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-8 flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-sm text-gray-400">או</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Login Link */}
          <div className="text-center">
            <p className="text-gray-600">
              כבר יש לך חשבון?{' '}
              <Link 
                to="/login" 
                className="text-emerald-600 hover:text-emerald-700 font-semibold hover:underline"
              >
                התחברות
              </Link>
            </p>
          </div>

          {/* Back to Home */}
          <div className="mt-8 text-center">
            <Link 
              to="/" 
              className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
              חזרה לדף הבית
            </Link>
          </div>
        </div>
      </div>

      {/* Right Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 p-12 flex-col justify-between relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white/5 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2" />
        </div>
        
        {/* Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{ 
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', 
            backgroundSize: '40px 40px' 
          }} />
        </div>

        {/* Content */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">FlowBotomat</span>
          </div>

          <h2 className="text-4xl xl:text-5xl font-bold text-white mb-6 leading-tight">
            התחל לבנות בוטים
            <br />
            <span className="text-white/80">תוך דקות ספורות</span>
          </h2>
          
          <p className="text-xl text-white/70 mb-10 max-w-md">
            עורך ויזואלי פשוט, תבניות מוכנות, ותמיכה מלאה. הכל מה שצריך כדי להצליח.
          </p>

          {/* Benefits */}
          <div className="grid grid-cols-2 gap-4 mb-12">
            {benefits.map((benefit, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${
                benefit.highlight ? 'bg-white/20 backdrop-blur' : ''
              }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  benefit.highlight ? 'bg-white/30' : 'bg-white/10'
                }`}>
                  <benefit.icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-white/90 font-medium text-sm">{benefit.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="relative z-10">
          <div className="grid grid-cols-3 gap-6 mb-8">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl xl:text-4xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-white/60 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Trust Badges */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-2 text-white/60">
              <Shield className="w-5 h-5" />
              <span className="text-sm">SSL מאובטח</span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <Clock className="w-5 h-5" />
              <span className="text-sm">תמיכה 24/7</span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm">ביטול בכל עת</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
