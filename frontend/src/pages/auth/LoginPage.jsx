import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Bot, Sparkles, Shield, Zap, ChevronLeft } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import Logo from '../../components/atoms/Logo';
import Input from '../../components/atoms/Input';
import Button from '../../components/atoms/Button';
import Alert from '../../components/atoms/Alert';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [form, setForm] = useState({ email: '', password: '' });

  const returnTo = location.state?.returnTo || '/dashboard';

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 flex items-center justify-center p-4" dir="rtl">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      </div>
      
      <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-center relative z-10">
        {/* Left Side - Branding */}
        <div className="hidden lg:block text-white">
          <Link to="/" className="inline-block mb-8">
            <Logo light className="!text-3xl" />
          </Link>
          
          <h1 className="text-4xl font-bold mb-4">
            ברוכים הבאים חזרה!
          </h1>
          <p className="text-xl text-white/80 mb-8">
            התחבר לחשבון שלך והמשך לבנות בוטים מדהימים
          </p>

          <div className="space-y-4">
            {[
              { icon: Bot, text: 'ניהול בוטים ללא הגבלה' },
              { icon: Zap, text: 'עורך ויזואלי אינטואיטיבי' },
              { icon: Shield, text: 'אבטחה ברמה הגבוהה ביותר' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-white/80">
                <div className="p-2 bg-white/10 rounded-lg">
                  <item.icon className="w-5 h-5" />
                </div>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-10">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-6">
            <Link to="/">
              <Logo className="!text-2xl" />
            </Link>
          </div>

          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl flex items-center justify-center">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">התחברות</h2>
            <p className="text-gray-500">הזן את פרטי החשבון שלך</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <Alert variant="error">{error}</Alert>}
            
            <Input
              label="אימייל"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@example.com"
              required
            />
            
            <Input
              label="סיסמה"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="הסיסמה שלך"
              required
            />
            
            <Button type="submit" isLoading={isLoading} className="w-full !py-3.5 !text-base !font-bold">
              התחברות
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-center text-gray-600">
              אין לך חשבון?{' '}
              <Link to="/signup" className="text-blue-600 hover:underline font-semibold">
                הרשמה חינם
              </Link>
            </p>
          </div>

          <div className="mt-6 text-center">
            <Link to="/" className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
              <ChevronLeft className="w-4 h-4 rotate-180" />
              חזרה לדף הבית
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
