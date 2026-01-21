import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Bot, MessageCircle, Zap, Users, ArrowLeft, Check, Star, 
  Workflow, Clock, Shield, Globe, Sparkles, ChevronLeft,
  Send, Calendar, BarChart3, Settings2, Play, MousePointer,
  ArrowDown, Plus, Type, Image, List
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
  const [demoStep, setDemoStep] = useState(0);

  // Animate demo steps
  useEffect(() => {
    const interval = setInterval(() => {
      setDemoStep(prev => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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

  const demoSteps = [
    { title: 'הוסף טריגר', desc: 'בחר מתי הבוט יופעל', icon: Play },
    { title: 'הוסף הודעה', desc: 'הגדר תגובה אוטומטית', icon: MessageCircle },
    { title: 'הוסף כפתורים', desc: 'צור אינטראקציה עם הלקוח', icon: List },
    { title: 'הפעל!', desc: 'הבוט מוכן לשימוש', icon: Zap },
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

      {/* Bot Builder Demo Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              בנה בוט ב-
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">60 שניות</span>
            </h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">
              עורך ויזואלי פשוט וחזק - פשוט גרור ושחרר אלמנטים לבניית הבוט המושלם
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 items-center">
            {/* Steps */}
            <div className="space-y-4">
              {demoSteps.map((step, index) => (
                <div 
                  key={index}
                  className={`flex items-center gap-4 p-4 rounded-xl transition-all duration-500 ${
                    demoStep === index 
                      ? 'bg-purple-600/30 border border-purple-500/50 scale-105' 
                      : 'bg-white/5 border border-white/10'
                  }`}
                >
                  <div className={`p-3 rounded-xl ${
                    demoStep === index ? 'bg-purple-600' : 'bg-white/10'
                  }`}>
                    <step.icon className={`w-6 h-6 ${demoStep === index ? 'text-white' : 'text-white/60'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${demoStep === index ? 'text-purple-400' : 'text-white/40'}`}>
                        {index + 1}
                      </span>
                      <h3 className={`font-semibold ${demoStep === index ? 'text-white' : 'text-white/70'}`}>
                        {step.title}
                      </h3>
                    </div>
                    <p className={`text-sm ${demoStep === index ? 'text-white/80' : 'text-white/40'}`}>
                      {step.desc}
                    </p>
                  </div>
                  {demoStep === index && (
                    <div className="mr-auto">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Visual Demo */}
            <div className="relative">
              <div className="bg-slate-800/80 rounded-2xl border border-white/10 p-6 shadow-2xl">
                {/* Mini Bot Editor */}
                <div className="bg-slate-900 rounded-xl p-4 min-h-[350px] relative overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-white/40 text-sm mr-4">בוט חדש.flow</span>
                  </div>

                  {/* Nodes */}
                  <div className="space-y-3">
                    {/* Trigger Node */}
                    <div className={`p-3 rounded-lg border transition-all duration-500 ${
                      demoStep >= 0 ? 'bg-green-900/30 border-green-500/50 opacity-100' : 'opacity-30 border-white/10'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Play className="w-4 h-4 text-green-400" />
                        <span className="text-white text-sm font-medium">טריגר: הודעה נכנסת</span>
                      </div>
                      <div className="text-white/50 text-xs mt-1">כל הודעה שמתחילה ב-"שלום"</div>
                    </div>

                    {/* Arrow */}
                    <div className={`flex justify-center transition-opacity duration-500 ${demoStep >= 1 ? 'opacity-100' : 'opacity-30'}`}>
                      <ArrowDown className="w-5 h-5 text-white/30" />
                    </div>

                    {/* Message Node */}
                    <div className={`p-3 rounded-lg border transition-all duration-500 ${
                      demoStep >= 1 ? 'bg-blue-900/30 border-blue-500/50 opacity-100' : 'opacity-30 border-white/10'
                    }`}>
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-blue-400" />
                        <span className="text-white text-sm font-medium">הודעת טקסט</span>
                      </div>
                      <div className="bg-slate-800 rounded p-2 mt-2 text-white/80 text-sm">
                        שלום! 👋 ברוכים הבאים לעסק שלנו. איך אוכל לעזור?
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className={`flex justify-center transition-opacity duration-500 ${demoStep >= 2 ? 'opacity-100' : 'opacity-30'}`}>
                      <ArrowDown className="w-5 h-5 text-white/30" />
                    </div>

                    {/* Buttons Node */}
                    <div className={`p-3 rounded-lg border transition-all duration-500 ${
                      demoStep >= 2 ? 'bg-purple-900/30 border-purple-500/50 opacity-100' : 'opacity-30 border-white/10'
                    }`}>
                      <div className="flex items-center gap-2">
                        <List className="w-4 h-4 text-purple-400" />
                        <span className="text-white text-sm font-medium">כפתורי בחירה</span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <div className="px-3 py-1.5 bg-purple-600/50 rounded-lg text-white text-xs">מידע על מוצרים</div>
                        <div className="px-3 py-1.5 bg-purple-600/50 rounded-lg text-white text-xs">שעות פתיחה</div>
                        <div className="px-3 py-1.5 bg-purple-600/50 rounded-lg text-white text-xs">דבר עם נציג</div>
                      </div>
                    </div>
                  </div>

                  {/* Success Animation */}
                  {demoStep === 3 && (
                    <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center rounded-xl animate-pulse">
                      <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-3 bg-green-500/20 rounded-full flex items-center justify-center">
                          <Check className="w-8 h-8 text-green-400" />
                        </div>
                        <div className="text-green-400 font-semibold">הבוט פעיל!</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Toolbar */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                  <div className="flex gap-2">
                    <div className="p-2 bg-white/5 rounded-lg hover:bg-white/10 cursor-pointer">
                      <Plus className="w-4 h-4 text-white/60" />
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg hover:bg-white/10 cursor-pointer">
                      <Type className="w-4 h-4 text-white/60" />
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg hover:bg-white/10 cursor-pointer">
                      <Image className="w-4 h-4 text-white/60" />
                    </div>
                  </div>
                  <Link 
                    to="/signup"
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    נסה בעצמך →
                  </Link>
                </div>
              </div>

              {/* Floating Elements */}
              <div className="absolute -top-4 -right-4 p-3 bg-green-500 rounded-xl shadow-lg animate-bounce">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-4 -left-4 p-3 bg-purple-500 rounded-xl shadow-lg">
                <Bot className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials / Trust Section */}
      <section className="py-16 px-4 bg-slate-800">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-1 mb-4">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-6 h-6 text-yellow-400 fill-current" />
            ))}
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">4.9/5 מתוך 500+ ביקורות</h3>
          <p className="text-white/60 mb-8">אלפי עסקים כבר משתמשים ב-FlowBotomat לאוטומציה של השירות שלהם</p>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <p className="text-white/80 text-sm mb-4">"הצלחתי לבנות בוט שירות לקוחות תוך 10 דקות! חסכתי שעות עבודה כל יום."</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold">ר</div>
                <div className="text-right">
                  <div className="text-white text-sm font-medium">רון כהן</div>
                  <div className="text-white/50 text-xs">בעל עסק</div>
                </div>
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <p className="text-white/80 text-sm mb-4">"הממשק הכי פשוט שראיתי. גם בלי רקע טכני הצלחתי לבנות בוטים מורכבים."</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold">מ</div>
                <div className="text-right">
                  <div className="text-white text-sm font-medium">מיכל לוי</div>
                  <div className="text-white/50 text-xs">יועצת עסקית</div>
                </div>
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <p className="text-white/80 text-sm mb-4">"התמיכה מדהימה והמערכת עובדת 24/7. הלקוחות שלי מקבלים מענה מיידי."</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">ד</div>
                <div className="text-right">
                  <div className="text-white text-sm font-medium">דוד אברהם</div>
                  <div className="text-white/50 text-xs">סוכן ביטוח</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-purple-600 to-pink-600">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            מוכנים להתחיל?
          </h2>
          <p className="text-white/80 text-lg mb-8">
            הצטרפו לאלפי עסקים שכבר משתמשים ב-FlowBotomat. 14 ימי ניסיון חינם, ללא התחייבות.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              to="/signup"
              className="px-8 py-4 bg-white text-purple-600 rounded-xl font-bold text-lg hover:bg-white/90 transition-colors shadow-lg"
            >
              התחל בחינם עכשיו
            </Link>
            <Link 
              to="/pricing"
              className="px-8 py-4 bg-white/20 text-white rounded-xl font-bold text-lg hover:bg-white/30 transition-colors border border-white/30"
            >
              צפה בתמחור
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 bg-slate-900 border-t border-white/10">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <Logo light />
              <p className="text-white/50 text-sm mt-4">
                הפלטפורמה המובילה בישראל לבניית בוטים לוואטסאפ
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">מוצר</h4>
              <ul className="space-y-2 text-white/50 text-sm">
                <li><Link to="/pricing" className="hover:text-white">תמחור</Link></li>
                <li><a href="#" className="hover:text-white">תכונות</a></li>
                <li><a href="#" className="hover:text-white">תבניות</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">חברה</h4>
              <ul className="space-y-2 text-white/50 text-sm">
                <li><a href="#" className="hover:text-white">אודות</a></li>
                <li><a href="#" className="hover:text-white">בלוג</a></li>
                <li><a href="#" className="hover:text-white">צור קשר</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">משפטי</h4>
              <ul className="space-y-2 text-white/50 text-sm">
                <li><a href="#" className="hover:text-white">תנאי שימוש</a></li>
                <li><a href="#" className="hover:text-white">מדיניות פרטיות</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/10 text-center text-white/40 text-sm">
            © 2026 FlowBotomat. כל הזכויות שמורות.
          </div>
        </div>
      </footer>

      {/* Mobile Login Button */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 backdrop-blur-lg border-t border-white/10 z-50">
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
