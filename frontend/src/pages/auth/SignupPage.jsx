import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, Sparkles, Shield, Zap, ChevronLeft, Check } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import Logo from '../../components/atoms/Logo';
import Input from '../../components/atoms/Input';
import Button from '../../components/atoms/Button';
import Alert from '../../components/atoms/Alert';

export default function SignupPage() {
  const navigate = useNavigate();
  const { signup, isLoading, error, clearError } = useAuthStore();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [privacyError, setPrivacyError] = useState(false);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 flex items-center justify-center p-4" dir="rtl">
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
            צור חשבון חדש
          </h1>
          <p className="text-xl text-white/80 mb-8">
            הצטרף לאלפי עסקים שכבר משתמשים בFlowBotomat
          </p>

          <div className="space-y-4 mb-8">
            {[
              { icon: Sparkles, text: '14 ימי ניסיון חינם' },
              { icon: Bot, text: 'בנה בוטים ללא הגבלה' },
              { icon: Zap, text: 'חיבור WhatsApp קל ומהיר' },
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

          <div className="p-4 bg-white/10 rounded-xl backdrop-blur">
            <p className="text-white/90 text-sm">
              "FlowBotomat שינה לנו את העסק. הלקוחות מקבלים מענה מיידי והמכירות עלו ב-40%"
            </p>
            <p className="text-white/60 text-sm mt-2">- רון כהן, בעל עסק</p>
          </div>
        </div>

        {/* Right Side - Signup Form */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-10">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-6">
            <Link to="/">
              <Logo className="!text-2xl" />
            </Link>
          </div>

          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">הרשמה</h2>
            <p className="text-gray-500">צור חשבון והתחל לבנות בוטים</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert variant="error">{error}</Alert>}
            {privacyError && <Alert variant="error">יש לאשר את מדיניות הפרטיות</Alert>}
            
            <Input
              label="שם"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="השם שלך"
            />
            
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
              placeholder="לפחות 8 תווים"
              required
              minLength={8}
            />
            
            {/* Privacy Policy Checkbox */}
            <label className={`flex items-start gap-3 cursor-pointer p-4 rounded-xl border-2 transition-all ${
              privacyError 
                ? 'border-red-300 bg-red-50' 
                : acceptPrivacy 
                  ? 'border-emerald-300 bg-emerald-50' 
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}>
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
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
                  className="text-blue-600 hover:underline mx-1 font-medium"
                >
                  מדיניות הפרטיות
                </Link>
              </span>
            </label>
            
            <Button 
              type="submit" 
              isLoading={isLoading} 
              className="w-full !py-3.5 !text-base !font-bold !bg-gradient-to-r !from-emerald-500 !to-teal-500 hover:!from-emerald-600 hover:!to-teal-600"
              disabled={!acceptPrivacy}
            >
              צור חשבון
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-center text-gray-600">
              כבר יש לך חשבון?{' '}
              <Link to="/login" className="text-blue-600 hover:underline font-semibold">
                התחברות
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
