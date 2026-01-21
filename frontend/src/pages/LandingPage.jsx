import { useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Bot, MessageCircle, Zap, Users, Check, ChevronLeft, Play, 
  List, Settings, Image, Clock, BarChart3, Shield, Sparkles,
  Globe, Headphones, Workflow, Database, Send, RefreshCw
} from 'lucide-react';
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Logo from '../components/atoms/Logo';
import useAuthStore from '../store/authStore';
import Input from '../components/atoms/Input';
import Button from '../components/atoms/Button';
import Alert from '../components/atoms/Alert';

// Custom Node Components for Demo
function DemoTriggerNode({ data }) {
  return (
    <div className="w-72 bg-white rounded-xl border-2 border-green-400 shadow-xl">
      <div className="px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-t-lg flex items-center gap-2">
        <Play className="w-5 h-5 text-white" fill="white" />
        <span className="font-bold text-white">טריגר</span>
      </div>
      <div className="p-4">
        <div className="text-xs text-gray-400 mb-1">הפעלה בעת:</div>
        <div className="text-gray-800 font-medium">{data.label}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-green-500 !w-4 !h-4 !border-2 !border-white" />
    </div>
  );
}

function DemoMessageNode({ data }) {
  return (
    <div className="w-72 bg-white rounded-xl border-2 border-blue-400 shadow-xl">
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-4 !h-4 !border-2 !border-white" />
      <div className="px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-t-lg flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-white" />
        <span className="font-bold text-white">הודעה</span>
      </div>
      <div className="p-4">
        <div className="bg-blue-50 rounded-lg p-3 text-sm text-gray-700 leading-relaxed">
          {data.label}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-4 !h-4 !border-2 !border-white" />
    </div>
  );
}

function DemoButtonsNode({ data }) {
  return (
    <div className="w-72 bg-white rounded-xl border-2 border-purple-400 shadow-xl">
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-4 !h-4 !border-2 !border-white" />
      <div className="px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-t-lg flex items-center gap-2">
        <List className="w-5 h-5 text-white" />
        <span className="font-bold text-white">כפתורי בחירה</span>
      </div>
      <div className="p-4 space-y-2">
        {data.buttons?.map((btn, i) => (
          <div key={i} className="px-4 py-2.5 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg text-sm text-purple-700 text-center font-medium hover:scale-105 transition-transform cursor-pointer">
            {btn}
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-500 !w-4 !h-4 !border-2 !border-white" />
    </div>
  );
}

function DemoActionNode({ data }) {
  return (
    <div className="w-72 bg-white rounded-xl border-2 border-orange-400 shadow-xl">
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-4 !h-4 !border-2 !border-white" />
      <div className="px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-500 rounded-t-lg flex items-center gap-2">
        <Settings className="w-5 h-5 text-white" />
        <span className="font-bold text-white">פעולה</span>
      </div>
      <div className="p-4">
        <div className="text-sm text-gray-700">{data.label}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-orange-500 !w-4 !h-4 !border-2 !border-white" />
    </div>
  );
}

const demoNodeTypes = {
  trigger: DemoTriggerNode,
  message: DemoMessageNode,
  buttons: DemoButtonsNode,
  action: DemoActionNode,
};

const initialNodes = [
  {
    id: '1',
    type: 'trigger',
    position: { x: 250, y: 0 },
    data: { label: 'הודעה נכנסת מתחילה ב-"שלום"' },
  },
  {
    id: '2',
    type: 'message',
    position: { x: 250, y: 180 },
    data: { label: 'שלום! 👋 ברוכים הבאים לעסק שלנו.\nאיך אוכל לעזור לך היום?' },
  },
  {
    id: '3',
    type: 'buttons',
    position: { x: 250, y: 380 },
    data: { buttons: ['🛒 מוצרים ומחירים', '⏰ שעות פתיחה', '📞 דבר עם נציג'] },
  },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
];

// Interactive Flow Demo Component
function InteractiveFlowDemo() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }, eds));
  }, [setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={demoNodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      minZoom={0.5}
      maxZoom={1.5}
      className="bg-gradient-to-br from-slate-50 to-blue-50"
    >
      <Background color="#cbd5e1" gap={20} size={1} />
      <Controls 
        className="!bg-white !border !border-gray-200 !rounded-xl !shadow-lg"
        showInteractive={false}
      />
    </ReactFlow>
  );
}

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

  const services = [
    {
      icon: Bot,
      title: 'בוטים אוטומטיים',
      desc: 'צור תרחישים מורכבים עם תנאים, לופים ומשתנים. הבוט עונה ללקוחות 24/7 באופן אוטומטי.',
      color: 'from-blue-500 to-indigo-600',
    },
    {
      icon: MessageCircle,
      title: 'חיבור WhatsApp',
      desc: 'התחבר לוואטסאפ שלך בסריקת QR פשוטה. קבל וענה להודעות דרך המערכת.',
      color: 'from-green-500 to-emerald-600',
    },
    {
      icon: Users,
      title: 'ניהול אנשי קשר',
      desc: 'CRM מובנה - צפה בכל השיחות, סמן תוויות, וצור פילוחים חכמים.',
      color: 'from-purple-500 to-pink-600',
    },
    {
      icon: Workflow,
      title: 'עורך ויזואלי',
      desc: 'עורך גרור-ושחרר אינטואיטיבי. אין צורך בידע טכני או קוד.',
      color: 'from-orange-500 to-red-600',
    },
    {
      icon: Database,
      title: 'משתנים ונתונים',
      desc: 'שמור מידע על לקוחות, צור טפסים דינמיים, ואסוף לידים.',
      color: 'from-cyan-500 to-blue-600',
    },
    {
      icon: BarChart3,
      title: 'סטטיסטיקות',
      desc: 'עקוב אחר ביצועי הבוטים, שיעורי המרה, וזמני תגובה.',
      color: 'from-violet-500 to-purple-600',
    },
  ];

  const features = [
    { icon: Clock, text: 'זמין 24/7' },
    { icon: Globe, text: 'עברית מלאה' },
    { icon: Shield, text: 'אבטחה מתקדמת' },
    { icon: Headphones, text: 'תמיכה מהירה' },
    { icon: RefreshCw, text: 'גיבוי אוטומטי' },
    { icon: Sparkles, text: 'עדכונים שוטפים' },
  ];

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-xs text-gray-400 hidden sm:block">שירותי אוטומציה</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/pricing" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium hidden sm:block">
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
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl transition-all text-sm font-medium shadow-lg shadow-blue-500/25"
            >
              התחל בחינם
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-28 pb-12 px-6 bg-gradient-to-b from-blue-50/50 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left - Text */}
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700 rounded-full text-sm font-medium mb-6">
                <Sparkles className="w-4 h-4" />
                14 ימי ניסיון חינם • ללא כרטיס אשראי
              </div>
              
              <h1 className="text-4xl lg:text-5xl xl:text-6xl font-extrabold text-gray-900 mb-6 leading-tight">
                אוטומציה ל
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">WhatsApp</span>
                <br />בלי לכתוב קוד
              </h1>
              
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                בנה בוטים חכמים לוואטסאפ העסקי שלך בעזרת עורך ויזואלי פשוט. 
                תן ללקוחות מענה מיידי, אסוף לידים, ושפר את השירות.
              </p>

              <div className="flex flex-wrap gap-4 mb-10">
                {features.slice(0, 4).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-gray-600 text-sm">
                    <div className="p-1 bg-green-100 rounded-full">
                      <Check className="w-3 h-3 text-green-600" />
                    </div>
                    <span>{f.text}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link 
                  to="/signup"
                  className="flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold transition-all shadow-xl shadow-blue-500/30 text-lg"
                >
                  התחל עכשיו בחינם
                  <ChevronLeft className="w-5 h-5" />
                </Link>
                <Link 
                  to="/pricing"
                  className="flex items-center justify-center px-8 py-4 bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl font-bold transition-all text-lg"
                >
                  צפה בתמחור
                </Link>
              </div>
            </div>

            {/* Right - Login Form */}
            <div className="hidden lg:block">
              <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-8 max-w-md mx-auto">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl flex items-center justify-center">
                    <Bot className="w-7 h-7 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">התחברות למערכת</h2>
                  <p className="text-gray-500">ברוכים הבאים חזרה</p>
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
                  
                  <Button type="submit" isLoading={isLoading} className="w-full !py-3 !text-base">
                    התחברות
                  </Button>
                  
                  <p className="text-center text-sm text-gray-500">
                    אין לך חשבון?{' '}
                    <Link to="/signup" className="text-blue-600 hover:underline font-medium">
                      הרשמה חינם
                    </Link>
                  </p>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Flow Editor Demo */}
      <section className="py-20 px-6 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium mb-4">
              <Workflow className="w-4 h-4" />
              עורך ויזואלי אינטראקטיבי
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              בנה בוטים בגרור ושחרר
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              נסה בעצמך! גרור את הבלוקים, חבר ביניהם, וראה איך קל לבנות בוט
            </p>
          </div>

          {/* Flow Editor */}
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
            {/* Editor Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-red-400" />
                  <div className="w-3.5 h-3.5 rounded-full bg-yellow-400" />
                  <div className="w-3.5 h-3.5 rounded-full bg-green-400" />
                </div>
                <span className="text-sm font-medium text-gray-600">בוט שירות לקוחות - דוגמה אינטראקטיבית</span>
              </div>
              <Link 
                to="/signup"
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                צור בוט משלך →
              </Link>
            </div>
            
            {/* Flow Canvas */}
            <div className="h-[550px]">
              <InteractiveFlowDemo />
            </div>

            {/* Editor Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-t border-gray-200">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  גרור את הבלוקים כדי לשחק
                </span>
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-400">
                <span>Scroll לזום</span>
                <span>גרור לתזוזה</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-4">
              <Zap className="w-4 h-4" />
              השירותים שלנו
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              כל מה שצריך לאוטומציה מושלמת
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              פלטפורמה אחת שמכילה את כל הכלים לניהול תקשורת אוטומטית עם הלקוחות
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service, i) => (
              <div 
                key={i} 
                className="group p-6 bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-xl transition-all duration-300"
              >
                <div className={`w-14 h-14 mb-5 bg-gradient-to-r ${service.color} rounded-2xl flex items-center justify-center transform group-hover:scale-110 transition-transform`}>
                  <service.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{service.title}</h3>
                <p className="text-gray-600 leading-relaxed">{service.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Bar */}
      <section className="py-12 px-6 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-white">
                <div className="p-2 bg-white/20 rounded-lg">
                  <f.icon className="w-5 h-5" />
                </div>
                <span className="font-medium">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-full text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            התחל היום ללא התחייבות
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
            מוכנים לשדרג את העסק?
          </h2>
          <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
            הצטרפו לאלפי עסקים שכבר חוסכים זמן וכסף עם בוטים אוטומטיים לוואטסאפ
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              to="/signup"
              className="inline-flex items-center justify-center gap-2 px-10 py-5 bg-white text-gray-900 rounded-xl font-bold text-lg hover:bg-gray-100 transition-colors shadow-2xl"
            >
              התחל 14 ימי ניסיון חינם
              <ChevronLeft className="w-5 h-5" />
            </Link>
          </div>
          <p className="text-gray-400 text-sm mt-6">
            ללא צורך בכרטיס אשראי • ביטול בכל עת
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-gray-900 border-t border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-3">
              <Logo light />
              <div className="text-right">
                <div className="text-white/60 text-xs">בוטומט</div>
                <div className="text-white/40 text-xs">שירותי אוטומציה</div>
              </div>
            </div>
            <div className="flex items-center gap-8 text-sm text-gray-400">
              <Link to="/pricing" className="hover:text-white transition-colors">תמחור</Link>
              <Link to="/privacy" className="hover:text-white transition-colors">מדיניות פרטיות</Link>
              <Link to="/terms" className="hover:text-white transition-colors">תנאי שימוש</Link>
            </div>
            <p className="text-sm text-gray-500">
              © 2026 בוטומט שירותי אוטומציה
            </p>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t border-gray-100 z-50">
        <div className="flex gap-3">
          <Link 
            to="/login"
            className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium text-center"
          >
            התחברות
          </Link>
          <Link 
            to="/signup"
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium text-center"
          >
            הרשמה
          </Link>
        </div>
      </div>
    </div>
  );
}
