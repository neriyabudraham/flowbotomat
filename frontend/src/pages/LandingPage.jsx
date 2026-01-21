import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Bot, MessageCircle, Zap, Users, ArrowLeft, Check, Star, 
  Workflow, Clock, Shield, Globe, Sparkles, ChevronLeft,
  Send, Calendar, BarChart3, Settings2
} from 'lucide-react';
import Logo from '../components/atoms/Logo';
import useAuthStore from '../store/authStore';
import Input from '../components/atoms/Input';
import Button from '../components/atoms/Button';
import Alert from '../components/atoms/Alert';

export default function LandingPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [showLogin, setShowLogin] = useState(true);
  const [form, setForm] = useState({ email: '', password: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    try {
      await login(form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      if (err.response?.data?.code === 'NOT_VERIFIED') {
        navigate('/verify', { state: { email: form.email } });
      }
    }
  };

  const features = [
    { icon: Bot, title: 'בוטים חכמים', desc: 'צור בוטים מתקדמים בלי לכתוב שורת קוד' },
    { icon: MessageCircle, title: 'WhatsApp', desc: 'חיבור ישיר לוואטסאפ שלך' },
    { icon: Zap, title: 'אוטומציה', desc: 'הפעל תהליכים אוטומטיים 24/7' },
    { icon: Users, title: 'ניהול לקוחות', desc: 'צפה בכל השיחות במקום אחד' },
    { icon: Workflow, title: 'זרימות עבודה', desc: 'עורך ויזואלי לבניית תרחישים' },
    { icon: Calendar, title: 'תזמון', desc: 'שלח הודעות בזמנים שנקבעו מראש' },
    { icon: BarChart3, title: 'סטטיסטיקות', desc: 'עקוב אחר ביצועי הבוטים שלך' },
    { icon: Shield, title: 'אבטחה', desc: 'הצפנה מלאה ואבטחת מידע' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900" dir="rtl">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Logo light />
          <div className="flex items-center gap-4">
            <Link to="/pricing" className="text-white/70 hover:text-white transition-colors">
              תמחור
            </Link>
            <button 
              onClick={() => setShowLogin(true)}
              className="text-white/70 hover:text-white transition-colors"
            >
              התחברות
            </button>
            <Link 
              to="/signup"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              התחל בחינם
            </Link>
          </div>
        </div>
      </header>

      <div className="flex min-h-screen pt-20">
        {/* Left Side - Hero Content */}
        <div className="flex-1 flex flex-col justify-center px-8 lg:px-16">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm mb-6">
              <Sparkles className="w-4 h-4" />
              פלטפורמה #1 לבוטים בישראל
            </div>
            
            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
              בנה בוטים לוואטסאפ
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400"> בקלות מדהימה</span>
            </h1>
            
            <p className="text-xl text-white/70 mb-8 leading-relaxed">
              FlowBotomat מאפשרת לך ליצור בוטים אוטומטיים לוואטסאפ בלי ידע טכני. 
              חבר את המספר שלך, בנה תרחישים, ותן לבוט לעבוד בשבילך.
            </p>

            <div className="flex flex-wrap gap-6 mb-10">
              <div className="flex items-center gap-2 text-white/60">
                <Check className="w-5 h-5 text-green-400" />
                <span>14 ימי ניסיון חינם</span>
              </div>
              <div className="flex items-center gap-2 text-white/60">
                <Check className="w-5 h-5 text-green-400" />
                <span>ללא כרטיס אשראי</span>
              </div>
              <div className="flex items-center gap-2 text-white/60">
                <Check className="w-5 h-5 text-green-400" />
                <span>תמיכה בעברית</span>
              </div>
            </div>

            <div className="flex gap-4">
              <Link 
                to="/signup"
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50"
              >
                התחל בחינם
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <Link 
                to="/pricing"
                className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all border border-white/20"
              >
                צפה בתמחור
              </Link>
            </div>
          </div>

          {/* Features Grid */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl">
            {features.map((feature, i) => (
              <div 
                key={i}
                className="p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors"
              >
                <feature.icon className="w-6 h-6 text-purple-400 mb-2" />
                <h3 className="text-white font-medium text-sm">{feature.title}</h3>
                <p className="text-white/50 text-xs mt-1">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="hidden lg:flex w-[480px] items-center justify-center p-8">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">התחברות</h2>
              <p className="text-gray-500">ברוך הבא חזרה! הזן את הפרטים שלך</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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
              
              <Button type="submit" isLoading={isLoading} className="w-full">
                התחברות
              </Button>
              
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">או</span>
                </div>
              </div>
              
              <Link 
                to="/signup"
                className="block w-full text-center px-4 py-3 border-2 border-purple-200 text-purple-600 rounded-xl font-medium hover:bg-purple-50 transition-colors"
              >
                צור חשבון חדש
              </Link>
            </form>

            <p className="text-center text-sm text-gray-400 mt-6">
              בהתחברות אתה מסכים ל
              <a href="#" className="text-purple-600 hover:underline">תנאי השימוש</a>
              {' '}ול
              <a href="#" className="text-purple-600 hover:underline">מדיניות הפרטיות</a>
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Login Button */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 backdrop-blur-lg border-t border-white/10">
        <div className="flex gap-3">
          <Link 
            to="/login"
            className="flex-1 px-4 py-3 bg-white/10 text-white rounded-xl font-medium text-center"
          >
            התחברות
          </Link>
          <Link 
            to="/signup"
            className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-xl font-medium text-center"
          >
            הרשמה
          </Link>
        </div>
      </div>
    </div>
  );
}
