import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Bot, MessageCircle, Zap, Users, Check, 
  ChevronLeft, Play, ArrowDown, List, 
  Settings, Image, Type
} from 'lucide-react';
import Logo from '../components/atoms/Logo';
import useAuthStore from '../store/authStore';
import Input from '../components/atoms/Input';
import Button from '../components/atoms/Button';
import Alert from '../components/atoms/Alert';

export default function LandingPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();
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

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <Logo />
          <div className="flex items-center gap-6">
            <Link to="/pricing" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">
              תמחור
            </Link>
            <Link 
              to="/login"
              className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium"
            >
              התחברות
            </Link>
            <Link 
              to="/signup"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              התחל בחינם
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left - Text */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium mb-6">
                <Zap className="w-4 h-4" />
                14 ימי ניסיון חינם
              </div>
              
              <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                בנה בוטים לוואטסאפ
                <br />
                <span className="text-blue-600">בדקות ספורות</span>
              </h1>
              
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                עורך ויזואלי פשוט ועוצמתי. גרור, שחרר, וצור תרחישים אוטומטיים לעסק שלך.
              </p>

              <div className="flex flex-wrap gap-4 mb-10">
                <div className="flex items-center gap-2 text-gray-600">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>ללא קוד</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>עברית מלאה</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>תמיכה מהירה</span>
                </div>
              </div>

              <div className="flex gap-4">
                <Link 
                  to="/signup"
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-blue-600/20"
                >
                  התחל בחינם
                  <ChevronLeft className="w-5 h-5" />
                </Link>
                <Link 
                  to="/pricing"
                  className="px-6 py-3 border border-gray-200 hover:border-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  צפה בתמחור
                </Link>
              </div>
            </div>

            {/* Right - Login Form */}
            <div className="hidden lg:block">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">התחברות</h2>
                  <p className="text-gray-500 text-sm">ברוכים הבאים חזרה</p>
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
                  
                  <p className="text-center text-sm text-gray-500">
                    אין לך חשבון?{' '}
                    <Link to="/signup" className="text-blue-600 hover:underline">
                      הרשמה
                    </Link>
                  </p>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bot Editor Preview */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              עורך ויזואלי אינטואיטיבי
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              פשוט גרור בלוקים, חבר ביניהם, והבוט מוכן
            </p>
          </div>

          {/* Flow Editor Preview */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Editor Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <span className="text-sm text-gray-500 font-medium">בוט שירות לקוחות</span>
              </div>
              <Link 
                to="/signup"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                נסה בעצמך →
              </Link>
            </div>
            
            {/* Editor Content */}
            <div className="flex">
              {/* Sidebar - Node Palette */}
              <div className="w-48 bg-gray-50 border-l border-gray-200 p-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">בלוקים</div>
                <div className="space-y-2">
                  {[
                    { icon: Play, label: 'טריגר', color: 'bg-green-100 text-green-700' },
                    { icon: MessageCircle, label: 'הודעה', color: 'bg-blue-100 text-blue-700' },
                    { icon: List, label: 'כפתורים', color: 'bg-purple-100 text-purple-700' },
                    { icon: Settings, label: 'פעולה', color: 'bg-orange-100 text-orange-700' },
                    { icon: Image, label: 'מדיה', color: 'bg-pink-100 text-pink-700' },
                  ].map((item, i) => (
                    <div 
                      key={i}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg ${item.color} cursor-pointer hover:opacity-80 transition-opacity`}
                    >
                      <item.icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Canvas */}
              <div className="flex-1 h-[400px] bg-[#fafafa] relative overflow-hidden" style={{ backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                {/* Trigger Node */}
                <div className="absolute top-8 right-8 w-64 bg-white rounded-xl border-2 border-green-400 shadow-lg">
                  <div className="px-4 py-3 bg-green-50 border-b border-green-100 rounded-t-xl flex items-center gap-2">
                    <div className="p-1.5 bg-green-500 rounded-lg">
                      <Play className="w-4 h-4 text-white" fill="white" />
                    </div>
                    <span className="font-semibold text-green-800">טריגר</span>
                  </div>
                  <div className="p-4">
                    <div className="text-sm text-gray-500 mb-1">הפעלה בעת:</div>
                    <div className="text-gray-900 font-medium">הודעה נכנסת מתחילה ב-"שלום"</div>
                  </div>
                  {/* Connection Point */}
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-green-500 rounded-full border-4 border-white shadow" />
                </div>

                {/* Connection Line 1 */}
                <svg className="absolute top-[140px] right-[140px] w-px h-16 pointer-events-none">
                  <line x1="0" y1="0" x2="0" y2="60" stroke="#9ca3af" strokeWidth="2" strokeDasharray="4" />
                </svg>

                {/* Message Node */}
                <div className="absolute top-[200px] right-8 w-64 bg-white rounded-xl border-2 border-blue-400 shadow-lg">
                  <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 rounded-t-xl flex items-center gap-2">
                    <div className="p-1.5 bg-blue-500 rounded-lg">
                      <MessageCircle className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-semibold text-blue-800">הודעה</span>
                  </div>
                  <div className="p-4">
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                      שלום! 👋 ברוכים הבאים.<br/>
                      איך אוכל לעזור לך היום?
                    </div>
                  </div>
                  {/* Connection Point Top */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow" />
                  {/* Connection Point Bottom */}
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow" />
                </div>

                {/* Connection Line 2 */}
                <svg className="absolute top-[360px] right-[140px] w-px h-16 pointer-events-none">
                  <line x1="0" y1="0" x2="0" y2="60" stroke="#9ca3af" strokeWidth="2" strokeDasharray="4" />
                </svg>

                {/* List/Buttons Node */}
                <div className="absolute top-[420px] right-8 w-64 bg-white rounded-xl border-2 border-purple-400 shadow-lg">
                  <div className="px-4 py-3 bg-purple-50 border-b border-purple-100 rounded-t-xl flex items-center gap-2">
                    <div className="p-1.5 bg-purple-500 rounded-lg">
                      <List className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-semibold text-purple-800">כפתורי בחירה</span>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="px-3 py-2 bg-purple-50 rounded-lg text-sm text-purple-700 text-center font-medium">🛒 מוצרים</div>
                    <div className="px-3 py-2 bg-purple-50 rounded-lg text-sm text-purple-700 text-center font-medium">⏰ שעות פתיחה</div>
                    <div className="px-3 py-2 bg-purple-50 rounded-lg text-sm text-purple-700 text-center font-medium">👤 דבר עם נציג</div>
                  </div>
                  {/* Connection Point Top */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-purple-500 rounded-full border-4 border-white shadow" />
                </div>

                {/* Floating Label */}
                <div className="absolute top-4 left-4 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-full shadow-lg">
                  גרור בלוקים לכאן
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              כל מה שצריך לעסק שלך
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { 
                icon: Bot, 
                title: 'בוטים חכמים', 
                desc: 'צור תרחישים מורכבים עם תנאים, לופים ואינטגרציות'
              },
              { 
                icon: MessageCircle, 
                title: 'חיבור WhatsApp', 
                desc: 'התחבר לוואטסאפ שלך תוך דקות וקבל הודעות בזמן אמת'
              },
              { 
                icon: Users, 
                title: 'ניהול אנשי קשר', 
                desc: 'צפה בהיסטוריית שיחות, פילוח לקוחות ותיוגים'
              },
            ].map((feature, i) => (
              <div key={i} className="text-center p-6">
                <div className="w-14 h-14 mx-auto mb-4 bg-blue-50 rounded-xl flex items-center justify-center">
                  <feature.icon className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-blue-600">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            מוכנים להתחיל?
          </h2>
          <p className="text-blue-100 text-lg mb-8">
            הצטרפו לאלפי עסקים שכבר משתמשים בFlowBotomat
          </p>
          <Link 
            to="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-600 rounded-lg font-bold text-lg hover:bg-blue-50 transition-colors"
          >
            התחל בחינם
            <ChevronLeft className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-gray-50 border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Logo />
            <div className="flex items-center gap-8 text-sm text-gray-500">
              <Link to="/pricing" className="hover:text-gray-900">תמחור</Link>
              <Link to="/privacy" className="hover:text-gray-900">מדיניות פרטיות</Link>
              <Link to="/terms" className="hover:text-gray-900">תנאי שימוש</Link>
            </div>
            <p className="text-sm text-gray-400">
              © 2026 FlowBotomat
            </p>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 z-50">
        <div className="flex gap-3">
          <Link 
            to="/login"
            className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-lg font-medium text-center"
          >
            התחברות
          </Link>
          <Link 
            to="/signup"
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium text-center"
          >
            הרשמה
          </Link>
        </div>
      </div>
    </div>
  );
}
