import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  Bot, Shield, Zap, ChevronLeft, Mail, Lock, Eye, EyeOff,
  MessageCircle, Users, ArrowRight
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Google Icon SVG
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, error, clearError, setTokens } = useAuthStore();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const returnTo = location.state?.returnTo || '/dashboard';

  const handleGoogleLogin = () => {
    if (!GOOGLE_CLIENT_ID) {
      useAuthStore.setState({ error: 'התחברות עם Google לא זמינה כרגע' });
      return;
    }
    
    setGoogleLoading(true);
    clearError();
    
    // Get referral code if exists (for new users signing up via login page)
    const referralCode = localStorage.getItem('referral_code');
    const referralExpiry = localStorage.getItem('referral_expiry');
    const isValidReferral = referralExpiry && Date.now() < parseInt(referralExpiry);
    
    // Build state with referral code
    const state = isValidReferral && referralCode ? JSON.stringify({ referral: referralCode }) : '';
    
    // Build Google OAuth URL - redirect directly (no popup)
    const redirectUri = `${window.location.origin}/api/auth/google/callback`;
    const scope = 'email profile';
    let googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=select_account`;
    
    if (state) {
      googleAuthUrl += `&state=${encodeURIComponent(state)}`;
    }
    
    // Redirect to Google
    window.location.href = googleAuthUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    try {
      await login(form.email, form.password);
      navigate(returnTo);
    } catch (err) {
      if (err.response?.data?.code === 'NOT_VERIFIED') {
        navigate('/verify', { state: { email: form.email, returnTo } });
      }
    }
  };

  const stats = [
    { value: '24/7', label: 'זמינות לקוחות' },
    { value: '100%', label: 'בעברית' },
    { value: '0₪', label: 'להתחלה' },
  ];

  const features = [
    { icon: MessageCircle, text: 'בוטים חכמים ל-WhatsApp' },
    { icon: Zap, text: 'עורך ויזואלי אינטואיטיבי' },
    { icon: Shield, text: 'אבטחה ברמה הגבוהה ביותר' },
    { icon: Users, text: 'ניהול לקוחות מתקדם' },
  ];

  return (
    <div className="min-h-screen flex" dir="rtl">
      {/* Left Side - Form */}
      <div className="flex-1 flex flex-col justify-center px-6 lg:px-16 xl:px-24 bg-white relative">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-[0.02]">
          <div className="absolute inset-0" style={{ 
            backgroundImage: 'radial-gradient(circle at 2px 2px, #6366f1 1px, transparent 0)', 
            backgroundSize: '32px 32px' 
          }} />
        </div>

        <div className="relative z-10 max-w-md mx-auto w-full">
          {/* Logo */}
          <Link to="/" className="inline-flex items-center gap-2 mb-8 group">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">FlowBotomat</span>
          </Link>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              ברוכים הבאים חזרה! 👋
            </h1>
            <p className="text-gray-500">
              התחבר לחשבון שלך והמשך לנהל את הבוטים שלך
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl">
              <p className="text-red-700 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">!</span>
                {error}
              </p>
            </div>
          )}

          {/* Google Sign In - Primary */}
          {GOOGLE_CLIENT_ID && (
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full py-4 bg-white border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-xl font-medium text-gray-700 shadow-sm hover:shadow transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {googleLoading ? (
                <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              ) : (
                <>
                  <GoogleIcon />
                  התחברות עם Google
                </>
              )}
            </button>
          )}

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-sm text-gray-400">או עם אימייל</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                כתובת אימייל
              </label>
              <div className={`relative rounded-xl transition-all ${
                focusedField === 'email' 
                  ? 'ring-2 ring-blue-500 ring-offset-2' 
                  : ''
              }`}>
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Mail className={`w-5 h-5 transition-colors ${
                    focusedField === 'email' ? 'text-blue-500' : 'text-gray-400'
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
                  ? 'ring-2 ring-blue-500 ring-offset-2' 
                  : ''
              }`}>
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Lock className={`w-5 h-5 transition-colors ${
                    focusedField === 'password' ? 'text-blue-500' : 'text-gray-400'
                  }`} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="הסיסמה שלך"
                  required
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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  התחברות
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Signup Link */}
          <div className="text-center mt-8">
            <p className="text-gray-600">
              אין לך חשבון עדיין?{' '}
              <Link 
                to="/signup" 
                className="text-blue-600 hover:text-blue-700 font-semibold hover:underline"
              >
                הרשמה חינם
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
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-12 flex-col justify-between relative overflow-hidden">
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
            נהל את העסק שלך
            <br />
            <span className="text-white/80">עם בוטים חכמים</span>
          </h2>
          
          <p className="text-xl text-white/70 mb-10 max-w-md">
            הפלטפורמה המובילה ליצירת בוטים לWhatsApp. התחל היום ותראה תוצאות מיידיות.
          </p>

          {/* Features */}
          <div className="space-y-4 mb-12">
            {features.map((feature, i) => (
              <div key={i} className="flex items-center gap-4 text-white/80">
                <div className="w-10 h-10 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <span className="font-medium">{feature.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="relative z-10">
          <div className="grid grid-cols-3 gap-6">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl xl:text-4xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-white/60 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonial */}
        <div className="relative z-10 mt-8 p-6 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-lg">
              ר
            </div>
            <div>
              <p className="text-white/90 mb-2">
                "FlowBotomat שינה את העסק שלנו. הלקוחות מקבלים מענה מיידי 24/7 והמכירות עלו ב-40%"
              </p>
              <p className="text-white/60 text-sm">רון כהן, מנכ"ל סטארטאפ</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
